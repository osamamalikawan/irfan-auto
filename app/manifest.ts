import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Irfan Autos",
    short_name: "Irfan Autos",
    start_url: "/inventory",
    display: "standalone",
    background_color: "#eceff3",
    theme_color: "#0e6b66",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
