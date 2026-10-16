export type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
};

export type AuthState = {
  error?: string;
  success?: string;
  fieldErrors?: FieldErrors;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin(email: string, password: string) {
  const fieldErrors: FieldErrors = {};

  if (!EMAIL.test(email) || email.length > 255) {
    fieldErrors.email = "Informe um e-mail válido.";
  }

  if (!password) {
    fieldErrors.password = "Informe a senha.";
  } else if (password.length > 72) {
    fieldErrors.password = "A senha pode ter no máximo 72 caracteres.";
  }

  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

export function validateSignup(name: string, email: string, password: string) {
  const fieldErrors: FieldErrors = validateLogin(email, password) ?? {};

  if (name.length < 2) {
    fieldErrors.name = "O nome precisa ter pelo menos 2 caracteres.";
  } else if (name.length > 120) {
    fieldErrors.name = "O nome pode ter no máximo 120 caracteres.";
  }

  if (password && password.length < 8) {
    fieldErrors.password = "A senha precisa ter pelo menos 8 caracteres.";
  }

  return Object.keys(fieldErrors).length ? fieldErrors : null;
}
