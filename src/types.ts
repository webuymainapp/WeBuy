export type TextbookStatus = 'unpaid' | 'paid' | 'collected';

export interface StudentProfile {
  id: string;
  regNo: string;
  fullName: string;
  department: string;
  faculty: string;
  level: string; // e.g., '300 Level'
  academicSession: string; // e.g., '2025/2026'
  email: string;
  phone: string;
  avatarUrl: string;
  emailVerified?: boolean;
}

export interface Textbook {
  id: string;
  courseCode: string;
  courseTitle: string;
  bookTitle: string;
  author: string;
  edition: string;
  price: number;
  status: TextbookStatus;
  coverUrl: string;
  department: string;
  level: string;
  lecturerName: string;
  isbn: string;
  pickupLocation: string;
  classRepName: string;
  paidAt?: string;
  collectedAt?: string;
  transactionRef?: string;
  passToken?: string;
  studentTextbookId?: string;
  addedBy?: string | null;
}

export type PaymentMethod = 'wallet' | 'bank_transfer' | 'card' | 'ussd';

export type TransactionCategory = 'purchase' | 'topup' | 'refund';
export type TransactionDirection = 'in' | 'out';

export interface PaymentTransaction {
  id: string;
  textbookId: string;
  bookTitle: string;
  courseCode: string;
  amount: number;
  fee: number;
  total: number;
  date: string;
  status: 'successful' | 'pending' | 'failed';
  reference: string;
  method: PaymentMethod;
  studentRegNo: string;
  category: TransactionCategory;
  direction: TransactionDirection;
  courseTitle?: string;
  books?: { courseCode: string; courseTitle?: string; bookTitle: string; amount: number }[];
  note?: string | null;
}

export interface CollectionRecord {
  id: string;
  textbookId: string;
  studentRegNo: string;
  studentName: string;
  courseCode: string;
  bookTitle: string;
  scannedAt: string;
  classRepName: string;
  location: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  soundEnabled: boolean;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface PortalUser {
  id: string;
  regNo: string;
  fullName: string;
  email: string;
  department: string;
  level: string;
  role: 'student' | 'class_rep' | 'chief_admin';
  emailVerified: boolean;
  createdAt: string;
}

