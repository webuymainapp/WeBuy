// HTTP error helper + async route wrapper so thrown errors reach one handler.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Handler = (
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) => unknown;

/** Wrap async handlers so rejections propagate to the error middleware. */
export function asyncHandler(handler: Handler): Handler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
