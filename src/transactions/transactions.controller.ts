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
import { Request as ExpressRequest } from 'express';

// Definimos la interfaz para reconocer req.user
interface RequestWithUser extends ExpressRequest {
  user: { id: string };
}

// Definimos un DTO para el cuerpo de la transferencia
interface TransferDto {
  cbuDestino: string;
  monto: number;
  motivo?: string;
}

@Controller('transactions')
@UseGuards(ClerkAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(@Request() req: RequestWithUser, @Body() body: TransferDto) {
    // TypeScript ahora sabe que req.user.id es un string
    const userId = req.user.id;

    return this.transactionsService.createTransfer(
      userId,
      body.cbuDestino,
      body.monto,
      body.motivo,
    );
  }

  @Get('history')
  async getHistory(@Request() req: RequestWithUser) {
    const userId = req.user.id;
    return this.transactionsService.getLocalHistory(userId);
  }
}
