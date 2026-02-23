import React from "react";
import { Link } from "react-router-dom";

export const HeaderLogo: React.FC = () => (
  <Link to="/home">
    <h1 className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-2xl font-bold tracking-tight text-transparent transition-opacity hover:opacity-80">
      Zedi
    </h1>
  </Link>
);
