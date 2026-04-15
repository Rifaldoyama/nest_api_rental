import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum VerifyPaymentStatus {
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export class VerifyPaymentDto {
  @IsEnum(VerifyPaymentStatus)
  status: VerifyPaymentStatus;

  @IsString()
  @IsOptional()
  catatan?: string;
}