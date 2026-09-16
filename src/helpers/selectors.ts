export const loginSelectors = {
  username: "//input[@name='userId']",
  password: "//input[@name='userPass']",
  signIn: "//table[@id='loginButton']",
} as const;

export const homeSelectors = {
  invoiceDropdown: "//li[@id='mnu-invoice']",
  invoiceOption: "//li[@id='mnu-invoice']//li[text()='Invoice']",
  invoiceLabel: "//span[text()='Invoice']",
} as const