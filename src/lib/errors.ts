// 要件定義書 §13「エラーレスポンス共通形式」に対応
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "DURATION_TOO_LONG"
  | "TOO_EARLY"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  FILE_TOO_LARGE: 422,
  DURATION_TOO_LONG: 422,
  TOO_EARLY: 425,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}

export function toErrorBody(error: ApiError) {
  return { error: { code: error.code, message: error.message } };
}
