import { IsUUID} from 'class-validator';

export class VerifyDto {
  @IsUUID()
  userId: string;
} 