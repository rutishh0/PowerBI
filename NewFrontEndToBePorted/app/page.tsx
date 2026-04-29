import { redirect } from "next/navigation"
import { isAuthenticated } from "./login/actions"
import { AppShell } from "@/components/shell/app-shell"

export default async function HomePage() {
  if (!(await isAuthenticated())) redirect("/login")
  return <AppShell />
}
