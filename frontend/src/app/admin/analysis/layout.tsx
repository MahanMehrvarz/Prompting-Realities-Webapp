import { AnalysisBreadcrumbProvider } from "./AnalysisBreadcrumbContext";

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  return <AnalysisBreadcrumbProvider>{children}</AnalysisBreadcrumbProvider>;
}
