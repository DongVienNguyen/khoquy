import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const c = await cookies();
  const role = c.get("staffRole")?.value || "";
  const dept = c.get("staffDept")?.value || "";

  if (role === "admin" || dept === "NQ") {
    redirect("/daily-report");
  } else {
    redirect("/sign-in");
  }
}