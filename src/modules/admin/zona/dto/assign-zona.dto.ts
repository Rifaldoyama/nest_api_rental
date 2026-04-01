import { IsUUID } from "class-validator";

export class AssignZonaDto {

  @IsUUID()
  zonaId: string;

}
