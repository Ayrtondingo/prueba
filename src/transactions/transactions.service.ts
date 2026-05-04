import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, FindOptionsWhere } from 'typeorm';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { CentralBankService } from '../central-bank/central-bank.service';
import { AxiosError } from 'axios';

// Interfaz para el error que devuelve el Banco Central
interface CentralBankErrorData {
  error?: string;
  message?: string;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly centralBankService: CentralBankService,
    private readonly dataSource: DataSource,
  ) {}

  async createTransfer(
    clerkId: string,
    receiverCbu: string,
    amountInput: number,
    motivo?: string,
  ) {
    const amount = Number(amountInput);

    // Validaciones
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    const cleanCbu = receiverCbu.replace(/\D/g, '');
    if (cleanCbu.length !== 22) {
      throw new BadRequestException('El CBU debe tener exactamente 22 dígitos');
    }

    // Iniciar transacción atómica
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // CORRECCIÓN DEFINITIVA: Usamos unknown para resetear el tipo antes de FindOptionsWhere
      const senderWhere = {
        user: { id: clerkId },
      } as unknown as FindOptionsWhere<Account>;

      const senderAccount = await queryRunner.manager.findOne(Account, {
        where: senderWhere,
        relations: ['user'],
      });

      if (!senderAccount) {
        throw new NotFoundException('Cuenta emisora no encontrada');
      }

      const senderBalance = Number(senderAccount.balance);

      if (senderAccount.accountNumber === cleanCbu) {
        throw new BadRequestException(
          'No puedes transferir a tu propia cuenta',
        );
      }

      if (senderBalance < amount) {
        throw new BadRequestException('Saldo insuficiente');
      }

      try {
        await this.centralBankService.registerTransaction({
          cbuOrigen: senderAccount.accountNumber,
          cbuDestino: cleanCbu,
          importe: amount,
          saldoOrigen: senderBalance,
        });
      } catch (cbError: unknown) {
        if (cbError instanceof AxiosError) {
          const data = cbError.response?.data as CentralBankErrorData;
          const errorMessage =
            data?.error || data?.message || 'Rechazado por el Banco Central';

          if (cbError.response?.status === 422) {
            throw new UnprocessableEntityException(errorMessage);
          }
          throw new BadRequestException(errorMessage);
        }
        throw new InternalServerErrorException(
          'Error de comunicación con el Banco Central',
        );
      }

      // Actualizar saldo local
      senderAccount.balance = Number((senderBalance - amount).toFixed(2));
      await queryRunner.manager.save(senderAccount);

      // Registrar transacción de envío
      const transaction = queryRunner.manager.create(Transaction, {
        amount: -amount,
        type: TransactionType.TRANSFER,
        description: motivo
          ? `Transferencia: ${motivo} - CBU: ${cleanCbu}`
          : `Transferencia a CBU: ${cleanCbu}`,
        account: senderAccount,
      });

      const savedTransaction = await queryRunner.manager.save(transaction);

      // Buscar cuenta del receptor local
      const receiverAccount = await queryRunner.manager.findOne(Account, {
        where: { accountNumber: cleanCbu },
      });

      if (receiverAccount) {
        receiverAccount.balance = Number(
          (Number(receiverAccount.balance) + amount).toFixed(2),
        );
        await queryRunner.manager.save(receiverAccount);

        const receiveTransaction = queryRunner.manager.create(Transaction, {
          amount: amount,
          type: TransactionType.TRANSFER,
          description: motivo
            ? `Recibido: ${motivo} - CBU: ${senderAccount.accountNumber}`
            : `Recibido de CBU: ${senderAccount.accountNumber}`,
          account: receiverAccount,
        });

        await queryRunner.manager.save(receiveTransaction);
      }

      await queryRunner.commitTransaction();

      return {
        id: savedTransaction.id,
        message: 'Transferencia procesada exitosamente',
        amount: amount,
        destinationCbu: cleanCbu,
      };
    } catch (error: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      ) {
        throw error;
      }

      const err = error as Error;
      throw new InternalServerErrorException(
        err.message || 'Error crítico en el servidor',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getLocalHistory(clerkId: string) {
    // CORRECCIÓN DEFINITIVA: Casting doble para evitar Unsafe assignment
    const historyWhere = {
      account: { user: { id: clerkId } },
    } as unknown as FindOptionsWhere<Transaction>;

    return await this.transactionRepository.find({
      where: historyWhere,
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}
