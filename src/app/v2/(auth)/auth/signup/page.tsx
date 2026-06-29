import { redirect } from "next/navigation";

export default function SignUpPage() {
  redirect("/v2/auth/login");
}
