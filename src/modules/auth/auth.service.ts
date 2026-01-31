import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Role } from '@prisma/client';

interface JwtPayload {
  sub: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existEmail = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existEmail) {
      throw new BadRequestException('Email already registered');
    }

    const existUsername = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existUsername) {
      throw new BadRequestException('Username already taken');
    }

    const hashed = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        password: hashed,
        role: Role.USER,
      },
    });

    return {
      message: 'Register success',
      userId: user.id,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        detail: true, // 🔥 ambil UserDetail
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,
      role: user.role,
    };

    const accessToken = this.jwt.sign(payload);

    return {
      message: 'Success login',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,

        is_lengkap: user.detail?.is_lengkap ?? false,
        need_profile:
          user.role === Role.USER && !(user.detail?.is_lengkap ?? false),
      },
    };
  }
}
