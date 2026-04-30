// src/transactions/transactions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { UsersModule } from '../users/users.module';
import { CentralBankModule } from '../central-bank/central-bank.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Account]),
    UsersModule,
    CentralBankModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
