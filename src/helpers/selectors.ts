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

export const invoiceSelectors = {
  selectInvoiceDate: "//b[contains(text(),'Invoice Date')]/ancestor::td/following-sibling::td//input",
  yesterdayOption: "//span[text()='Yesterday']",
  searchCompanyName: "//div[text()='Company']/following-sibling::div//input",
  invoiceNum: (invNumber: string) => `//u[text()='${invNumber}']`,
  printDropdown: "(//button[text()='Print Invoice'])[2]",
  printInvoice: "//a/span[text()='Print Invoice']",
  printButton: "//button[text()='Print']",
  invSearch: "//div[text()='INV #']/following-sibling::div//input",
} as const
