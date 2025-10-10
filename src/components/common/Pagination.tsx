"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  currentPage: number;
  totalPages: number;
  onPageChange: (p: number) => void;
};

const Pagination: React.FC<Props> = ({ currentPage, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex justify-center items-center gap-4 py-4">
      <Button variant="outline" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>
        <ChevronLeft className="w-4 h-4 mr-2" /> Trước
      </Button>
      <span className="text-slate-700 font-medium">Trang {currentPage} trên {totalPages}</span>
      <Button variant="outline" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>
        Tiếp <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
};

export default Pagination;