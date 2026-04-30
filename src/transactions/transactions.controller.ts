// backend/src/transactions/transactions.controller.ts

import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('transactions')
@UseGuards(ClerkAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(
    @Request() req,
    @Body() body: { cbuDestino: string; monto: number; motivo?: string },
  ) {
    const userId = req.user.id;

    return this.transactionsService.createTransfer(
      userId,
      body.cbuDestino,
      body.monto,
      body.motivo,
    );
  }

  @Get('history')
  async getHistory(@Request() req) {
    const userId = req.user.id;
    return this.transactionsService.getLocalHistory(userId);
  }
}
