export type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  currentPassword?: string;
  confirmation?: string;
};

export type AuthState = {
  error?: string;
  success?: string;
  fieldErrors?: FieldErrors;
  revision?: string;
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

export function validateAccount(name: string, email: string, currentPassword: string) {
  const fieldErrors: FieldErrors = {};

  if (name.length < 2) {
    fieldErrors.name = "O nome precisa ter pelo menos 2 caracteres.";
  } else if (name.length > 120) {
    fieldErrors.name = "O nome pode ter no máximo 120 caracteres.";
  }

  if (!EMAIL.test(email) || email.length > 255) {
    fieldErrors.email = "Informe um e-mail válido.";
  }

  if (!currentPassword) {
    fieldErrors.currentPassword = "Informe a senha atual.";
  } else if (currentPassword.length > 72) {
    fieldErrors.currentPassword = "A senha pode ter no máximo 72 caracteres.";
  }

  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

export function validatePasswordChange(
  currentPassword: string,
  password: string,
  confirmation: string,
) {
  const fieldErrors: FieldErrors = {};

  if (!currentPassword) {
    fieldErrors.currentPassword = "Informe a senha atual.";
  } else if (currentPassword.length > 72) {
    fieldErrors.currentPassword = "A senha pode ter no máximo 72 caracteres.";
  }

  if (!password) {
    fieldErrors.password = "Informe a nova senha.";
  } else if (password.length < 8) {
    fieldErrors.password = "A senha precisa ter pelo menos 8 caracteres.";
  } else if (password.length > 72) {
    fieldErrors.password = "A senha pode ter no máximo 72 caracteres.";
  }

  if (password && confirmation !== password) {
    fieldErrors.confirmation = "A confirmação precisa ser igual à nova senha.";
  }

  return Object.keys(fieldErrors).length ? fieldErrors : null;
}
