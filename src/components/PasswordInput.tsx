import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  leftIcon?: React.ReactNode;
}

/**
 * Password field with a standard show/hide toggle: an eye/eye-off icon button
 * placed inside the input's right edge and vertically centered.
 */
export const PasswordInput: React.FC<PasswordInputProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  required,
  minLength,
  autoComplete,
  leftIcon,
}) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative w-full">
      {leftIcon && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
          {leftIcon}
        </span>
      )}
      <input
        type={visible ? 'text' : 'password'}
        required={required}
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full ${leftIcon ? 'pl-9' : 'pl-4'} pr-14 ${className}`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-0 top-0 bottom-0 flex items-center justify-center rounded-r-xl bg-indigo-600 text-white shadow-none hover:bg-indigo-500 active:scale-[0.98] transition-all cursor-pointer px-2.5"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
};
