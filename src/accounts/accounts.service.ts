import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { User } from '../users/entities/user.entity'; // Asumiendo que tienes una entidad User

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User) // Necesitamos el repositorio de User para la relación
    private readonly userRepository: Repository<User>,
  ) {}

  async findByClerkId(clerkId: string): Promise<Account | undefined> {
    return this.accountRepository.findOne({
      where: { user: { id: clerkId } },
      relations: ['user'], // Cargar la relación con el usuario si es necesario
    });
  }
  // Aquí podrías añadir métodos para crear cuentas, actualizar alias, etc.
}
