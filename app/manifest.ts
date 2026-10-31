import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Irfan Autos",
    short_name: "Irfan Autos",
    start_url: "/inventory",
    display: "standalone",
    background_color: "#eef4ff",
    theme_color: "#1f5fd6",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
