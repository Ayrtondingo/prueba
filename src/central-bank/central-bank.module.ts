import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CentralBankService } from './central-bank.service';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [CentralBankService],
  exports: [CentralBankService], // Exportar el servicio para que TransactionsModule pueda usarlo
})
export class CentralBankModule {}
