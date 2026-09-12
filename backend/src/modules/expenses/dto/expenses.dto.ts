import { IsString, IsOptional, IsNumber, IsUUID, Min, MinLength } from 'class-validator';

export class CreateExpenseDto {
  @IsUUID('4')
  branchId: string;

  @IsOptional()
  @IsUUID('4')
  shiftId?: string;

  @IsString()
  expenseCategory: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @MinLength(3)
  description: string;

  @IsOptional()
  @IsString()
  receiptImageUrl?: string;
}

export class ApproveExpenseDto {
  @IsUUID('4')
  approvedBy: string;
}

export class ExpenseQueryDto {
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsUUID('4')
  shiftId?: string;

  @IsOptional()
  @IsString()
  expenseCategory?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
