import { pingSimpleBarricade } from "@/app/actions/catalog";

export async function POST(request: Request) {
  const formData = await request.formData();
  try {
    const result = await pingSimpleBarricade({}, formData);
    return Response.json(result);
  } catch (error) {
    const digest = error && typeof error === "object" && "digest" in error ? String(error.digest) : "";
    if (digest.startsWith("NEXT_REDIRECT")) {
      return Response.json({ error: "Sua sessão expirou. Entre de novo." }, { status: 401 });
    }
    throw error;
  }
}
