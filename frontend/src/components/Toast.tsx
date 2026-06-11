'use client';

import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(true);
    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(onClose, 300);
    }, 2000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className={`fixed left-1/2 top-4 z-[9999] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-teal-700 px-4 py-3 text-white shadow-lg transition-all duration-300 ${
        show ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
      }`}
    >
      <CheckCircle className="h-5 w-5" />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
}
