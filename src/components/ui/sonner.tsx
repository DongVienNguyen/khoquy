"use client";

import { Toaster } from "sonner";
import React from "react";

export const SonnerToaster: React.FC = () => {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      duration={2500}
      toastOptions={{
        classNames: {
          success: "bg-green-600 text-white",
          error: "bg-red-600 text-white",
          warning: "bg-yellow-600 text-white",
          info: "bg-primary text-primary-foreground",
        },
      }}
    />
  );
};