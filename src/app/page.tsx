import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function Home() {
  const c = await cookies();
  const role = c.get("staffRole")?.value || "";
  const dept = c.get("staffDept")?.value || "";

  // user + NQ: trang mặc định là daily-report
  if (role === "user" && dept === "NQ") {
    redirect("/daily-report");
  }

  // user + không phải NQ: trang mặc định là asset-entry
  if (role === "user") {
    redirect("/asset-entry");
  }

  // admin: giữ nguyên hành vi cũ là vào daily-report
  if (role === "admin") {
    redirect("/daily-report");
  }

  // chưa đăng nhập hoặc role khác: về sign-in
  redirect("/sign-in");
}