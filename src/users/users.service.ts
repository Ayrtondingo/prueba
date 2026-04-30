import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Account } from '../accounts/entities/account.entity';
import { CentralBankService } from '../central-bank/central-bank.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly centralBankService: CentralBankService,
  ) {}

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
    const centralBankData = await this.centralBankService.registerPerson(data);

    account.accountNumber = centralBankData.cbu;
    user.fullName = `${centralBankData.nombre} ${centralBankData.apellido}`;

    await this.accountRepository.save(account);
    await this.userRepository.save(user);

    return {
      message: 'CBU sincronizado exitosamente',
      cbu: centralBankData.cbu,
      account,
    };
  }

  async findOne(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['account'],
    });
  }

  async createFromClerk(clerkId: string, email: string, fullName: string) {
    const normalizedEmail = email || `${clerkId}@pending.local`;
    const normalizedFullName = fullName || 'Usuario Cayman';

    const existingUser = await this.findOne(clerkId);
    if (existingUser) {
      existingUser.email = normalizedEmail;
      existingUser.fullName = normalizedFullName;
      await this.userRepository.save(existingUser);
      const account = await this.ensureAccount(existingUser);

      return {
        message: 'Usuario ya existente',
        user: existingUser,
        account,
      };
    }

    const existingByEmail = await this.findOneByEmail(normalizedEmail);
    if (existingByEmail) {
      existingByEmail.id = clerkId;
      existingByEmail.fullName = normalizedFullName;
      const savedUser = await this.userRepository.save(existingByEmail);
      const account = await this.ensureAccount(savedUser);

      return {
        message: 'Usuario asociado por email',
        user: savedUser,
        account,
      };
    }

    try {
      const savedUser = await this.userRepository.save(
        this.userRepository.create({
          id: clerkId,
          email: normalizedEmail,
          fullName: normalizedFullName,
        }),
      );
      const account = await this.ensureAccount(savedUser);

      return {
        message: 'Usuario y cuenta creados con exito',
        user: savedUser,
        account,
      };
    } catch (error: any) {
      if (error?.code === '23505') {
        const recoveredUser =
          (await this.findOne(clerkId)) ||
          (await this.findOneByEmail(normalizedEmail));

        if (recoveredUser) {
          const account = await this.ensureAccount(recoveredUser);
          return {
            message: 'Usuario recuperado tras sincronizacion concurrente',
            user: recoveredUser,
            account,
          };
        }
      }

      throw error;
    }
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
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (updateData.fullName) {
      user.fullName = updateData.fullName;
    }

    return await this.userRepository.save(user);
  }

  async getCombinedHistory(clerkId: string) {
    const user = await this.findOne(clerkId);
    if (!user || !user.account?.accountNumber) return [];

    const myCbu = user.account.accountNumber;

    try {
      const allCentralTxs = await this.centralBankService.getTransactions();
      const myTxs = allCentralTxs.filter(
        (tx: any) => tx.cbuOrigen === myCbu || tx.cbuDestino === myCbu,
      );

      return myTxs.map((tx: any) => ({
        id: tx.id,
        amount:
          tx.cbuDestino === myCbu ? Number(tx.importe) : -Number(tx.importe),
        description:
          tx.cbuDestino === myCbu
            ? `Recibido de: ${tx.cbuOrigen}`
            : `Enviado a: ${tx.cbuDestino}`,
        createdAt: tx.createdAt,
      }));
    } catch (error) {
      console.error('Error al traer historial de la red:', error);
      return [];
    }
  }

  private async ensureAccount(user: User): Promise<Account> {
    if (user.account) return user.account;

    const existingAccount = await this.accountRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['user'],
    });

    if (existingAccount) {
      user.account = existingAccount;
      return existingAccount;
    }

    user.account = await this.accountRepository.save(
      this.accountRepository.create({
        accountNumber: null,
        balance: 150000,
        user,
      }),
    );

    return user.account;
  }
}
