import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionType } from './entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { CentralBankService } from '../central-bank/central-bank.service'; // Asegúrate de que la ruta sea correcta

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
    amount: number,
    motivo?: string,
  ) {
    amount = Number(amount);

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
      // Buscar cuenta del remitente
      const senderAccount = await queryRunner.manager.findOne(Account, {
        where: { user: { id: clerkId } },
        relations: ['user'],
      });

      if (!senderAccount) {
        throw new NotFoundException('Cuenta emisora no encontrada');
      }

      const senderBalance = Number(senderAccount.balance);

      // Validar que no se envíe a su propia cuenta
      if (senderAccount.accountNumber === cleanCbu) {
        throw new BadRequestException(
          'No puedes transferir a tu propia cuenta',
        );
      }

      // Validar saldo suficiente
      if (senderBalance < amount) {
        throw new BadRequestException('Saldo insuficiente');
      }

      try {
        // Llamada al banco central
        await this.centralBankService.registerTransaction({
          cbuOrigen: senderAccount.accountNumber,
          cbuDestino: cleanCbu,
          importe: amount,
          saldoOrigen: senderBalance,
        });
      } catch (cbError: any) {
        const errorMessage =
          cbError.response?.data?.error ||
          cbError.response?.data?.message ||
          'Rechazado por el Banco Central';
        // Si el banco central devuelve error de saldo, usamos 422 según su spec
        if (cbError.response?.status === 422) {
          throw new UnprocessableEntityException(errorMessage);
        }
        throw new BadRequestException(errorMessage);
      }

      // Actualizar saldo local del remitente
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

      // Buscar cuenta del receptor (si existe en nuestro sistema)
      const receiverAccount = await queryRunner.manager.findOne(Account, {
        where: { accountNumber: cleanCbu },
      });

      // Si el receptor existe en nuestro sistema, acreditarle
      if (receiverAccount) {
        receiverAccount.balance = Number(
          (Number(receiverAccount.balance) + amount).toFixed(2),
        );
        await queryRunner.manager.save(receiverAccount);

        // Registrar transacción de recepción
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
    } catch (error: any) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof UnprocessableEntityException
      )
        throw error;
      throw new InternalServerErrorException(
        error.message || 'Error crítico en el servidor',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getLocalHistory(clerkId: string) {
    return await this.transactionRepository.find({
      where: { account: { user: { id: clerkId } } },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }
}
