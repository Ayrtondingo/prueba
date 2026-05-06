import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { User } from './entities/user.entity';
import { Account } from '../accounts/entities/account.entity';
import { CentralBankService } from '../central-bank/central-bank.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';
import { createClerkClient } from '@clerk/clerk-sdk-node';

interface CentralBankTx {
  id: string;
  cbuOrigen: string;
  cbuDestino: string;
  importe: number;
  createdAt: string;
}

const buildFallbackCbu = (dni: string) => {
  const cleanDni = String(dni || '').replace(/\D/g, '').slice(-8).padStart(8, '0');
  return `00100014${cleanDni}0000105`;
};

const isValidCbu = (cbu?: string | null) => Boolean(cbu && /^\d{22}$/.test(cbu));

@Injectable()
export class UsersService {
  // Inicializamos el cliente de Clerk para gestión de contraseñas
  private clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly centralBankService: CentralBankService,
  ) {}

  /**
   * Actualiza la contraseña en Clerk utilizando el SDK de servidor.
   */
  async updateClerkPassword(userId: string, newPassword: string) {
    try {
      await this.clerkClient.users.updateUser(userId, {
        password: newPassword,
      });
      return { message: 'PASSWORD_UPDATED_SUCCESSFULLY' };
    } catch (error: any) {
      console.error('CLERK_UPDATE_ERROR:', error);
      const errorMessage = error.errors?.[0]?.longMessage || 'ERROR_UPDATING_PASSWORD';
      throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Sincroniza los datos con el Banco Central y asigna el CBU y ALIAS a la cuenta local.
   */
  async syncWithCentralBank(userId: string, data: CreatePersonDto) {
  let user = await this.userRepository.findOne({
    where: { id: userId },
    relations: ['account'],
  });

  if (!user) {
    user = await this.userRepository.save(
      this.userRepository.create({
        id: userId,
        email: `${userId}@pending.local`,
        fullName: `${data.nombre} ${data.apellido}`,
      }),
    );
  }

  const account = await this.ensureAccount(user);

  try {
    // 1. Intentamos registrar en el Banco Central
    const centralBankData = await this.centralBankService.registerPerson(data);
    
    // Si tiene éxito, actualizamos el CBU (accountNumber)
    account.accountNumber = centralBankData.cbu;
    // Usamos los datos que nos confirma el Banco Central
    user.fullName = `${centralBankData.nombre} ${centralBankData.apellido}`;
    account.alias = centralBankData.alias ?? account.alias;

    if (data.alias) {
      await this.centralBankService.updateAlias(centralBankData.cbu, data.alias);
      account.alias = data.alias;
    }
    
  } catch (error: any) {
  // Extraemos el mensaje de forma segura
  const errorMessage = error?.response?.data?.message || error?.message || 'UNKNOWN_ERROR';
  
  console.warn(`⚠️ [BC_SYNC_BYPASS]: ${errorMessage}`);
  
  // Aquí es donde forzamos que el flujo siga
  if (!isValidCbu(account.accountNumber)) {
    account.accountNumber = buildFallbackCbu(data.dni);
  }
  user.fullName = `${data.nombre} ${data.apellido}`;
}

  if (data.alias) {
    account.alias = data.alias;
  }

  // 4. Guardamos los cambios en nuestra base de datos local
  await Promise.all([
    this.accountRepository.save(account),
    this.userRepository.save(user),
  ]);

  return {
    message: 'Sincronización local completada',
    cbu: account.accountNumber,
    alias: account.alias,
    fullName: user.fullName,
    account,
  };
}

  /**
   * Crea o actualiza el usuario basado en los datos de Clerk.
   */
  async createFromClerk(clerkId: string, email: string, fullName: string) {
    const normalizedEmail = email?.toLowerCase() || `${clerkId}@pending.local`;
    const normalizedFullName = fullName || 'Usuario Cayman';

    let user = await this.userRepository.findOne({
      where: [{ id: clerkId }, { email: normalizedEmail }],
      relations: ['account'],
    });

    if (user) {
      if (user.id !== clerkId) {
        await this.userRepository.delete(user.id);
        user = this.userRepository.create({
          id: clerkId,
          email: normalizedEmail,
          fullName: normalizedFullName,
        });
      } else {
        user.email = normalizedEmail;
        user.fullName = normalizedFullName;
      }
      
      const savedUser = await this.userRepository.save(user);
      const account = await this.ensureAccount(savedUser);
      return { message: 'Usuario sincronizado', user: savedUser, account };
    }

    try {
      const newUser = this.userRepository.create({
        id: clerkId,
        email: normalizedEmail,
        fullName: normalizedFullName,
      });
      const savedUser = await this.userRepository.save(newUser);
      const account = await this.ensureAccount(savedUser);

      return { message: 'Usuario y cuenta creados con éxito', user: savedUser, account };
    } catch (error) {
      const recoveredUser = await this.findOne(clerkId) || await this.findOneByEmail(normalizedEmail);
      if (recoveredUser) {
        const account = await this.ensureAccount(recoveredUser);
        return { message: 'Usuario recuperado', user: recoveredUser, account };
      }
      throw error;
    }
  }

  // src/users/users.service.ts
async findOne(id: string) {
  return await this.userRepository.findOne({
    where: { id },
    relations: ['account'],
    cache: false, // Forzar búsqueda fresca
  });
}

  async findOneByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['account'],
    });
  }

  async findById(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['account'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async updateProfile(id: string, updateData: { fullName?: string }) {
    const user = await this.findById(id);
    if (updateData.fullName) {
      user.fullName = updateData.fullName;
    }
    return await this.userRepository.save(user);
  }

  async updateAlias(clerkId: string, alias: string) {
    const user = await this.findById(clerkId);
    const account = await this.ensureAccount(user);

    if (!isValidCbu(account.accountNumber)) {
      throw new HttpException('CBU_NOT_LINKED', HttpStatus.BAD_REQUEST);
    }

    await this.centralBankService.updateAlias(account.accountNumber, alias);
    account.alias = alias;
    await this.accountRepository.save(account);

    return {
      message: 'ALIAS_UPDATED_SUCCESSFULLY',
      alias,
    };
  }

  /**
   * Trae el historial de transacciones desde el Banco Central y filtra las del usuario.
   */
  async getCombinedHistory(clerkId: string) {
    const user = await this.findOne(clerkId);
    if (!user || !user.account?.accountNumber) return [];

    const myCbu = user.account.accountNumber;

    try {
      const allCentralTxs = (await this.centralBankService.getTransactions()) as unknown as CentralBankTx[];

      const myTxs = allCentralTxs.filter(
        (tx) => tx.cbuOrigen === myCbu || tx.cbuDestino === myCbu,
      );

      return myTxs.map((tx) => ({
        id: tx.id,
        amount: tx.cbuDestino === myCbu ? Number(tx.importe) : -Number(tx.importe),
        description: tx.cbuDestino === myCbu 
          ? `Recibido de: ${tx.cbuOrigen}` 
          : `Enviado a: ${tx.cbuDestino}`,
        createdAt: tx.createdAt,
      }));
    } catch (error) {
      console.error('Error al traer historial de la red:', error);
      return [];
    }
  }

  /**
   * Asegura que el usuario tenga una cuenta.
   */
  private async ensureAccount(user: User): Promise<Account> {
    if (user.account) return user.account;

    const accountWhere = {
      user: { id: user.id },
    } as unknown as FindOptionsWhere<Account>;

    const existingAccount = await this.accountRepository.findOne({
      where: accountWhere,
      relations: ['user'],
    });

    if (existingAccount) {
      user.account = existingAccount;
      return existingAccount;
    }

    const newAccount = this.accountRepository.create({
      accountNumber: null as unknown as string,
      alias: null as unknown as string,
      balance: 150000,
      user,
    });

    const savedAccount = await this.accountRepository.save(newAccount);
    user.account = savedAccount;
    return savedAccount;
  }
}
