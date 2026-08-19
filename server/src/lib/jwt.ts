import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthTokenPayload {
  sub: string; // student id
  role: 'student' | 'class_rep' | 'chief_admin';
  reg_no: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, config.jwtSecret) as AuthTokenPayload;
}

export function signPassToken(payload: {
  sub: string; // student_textbooks.id
  book: string; // book title
  course: string; // course code
}): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '90d' });
}

export function verifyPassToken(token: string): {
  sub: string;
  book: string;
  course: string;
} {
  return jwt.verify(token, config.jwtSecret) as {
    sub: string;
    book: string;
    course: string;
  };
}
