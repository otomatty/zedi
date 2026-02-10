import React from "react";
import { Link } from "react-router-dom";

export const HeaderLogo: React.FC = () => (
  <Link to="/home">
    <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent hover:opacity-80 transition-opacity">
      Zedi
    </h1>
  </Link>
);
