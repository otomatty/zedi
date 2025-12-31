import React from "react";
import { cn } from "@/lib/utils";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

const Container: React.FC<ContainerProps> = ({ children, className }) => {
  return (
    <div
      className={cn(
        "w-full max-w-[1280px] mx-auto",
        "px-4 sm:px-6 md:px-8",
        className
      )}
    >
      {children}
    </div>
  );
};

export default Container;
