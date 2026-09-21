export const loginSelectors = {
  username: "//input[@name='userId']",
  password: "//input[@name='userPass']",
  signIn: "//table[@id='loginButton']",
} as const;

export const homeSelectors = {
  invoiceDropdown: "//li[@id='mnu-invoice']",
  invoiceOption: "//li[@id='mnu-invoice']//li[text()='Invoice']",
  invoiceLabel: "//span[text()='Invoice']",
  salesDropdown: "//li[@id='mnu-sales']",
  salesOption: "//li[text()='SO List']",
  refresh: "(//button[contains(@class,'loading')])[1]",
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

export const salesSelectors = {
  pleaseWait: "//div[contains(text(),'Please wait')]",
  loading: "//div[contains(text(),'Loading') and not(@id)]",
  statusDropdown: "//b[contains(text(),'Status')]/ancestor::td/following-sibling::td//input[not(@value)]",
  statusOpenOption: "//div[contains(@class,'list-item') and text()='Open']",
  firstSalesOrder: "(//div[text()='SO #']/ancestor::div[contains(@class,'header')]/following-sibling::div[contains(@class,'scroller')]//div[contains(@class,'col-0')]/u)[1]",
  saveButton: "//button[text()='Save']",
  saveButtonPickList: "(//button[text()='Save'])[2]",
  pickRequestButton: "//button[text()='Refresh']/ancestor::td/following-sibling::td//button[text()='Pick Request']",
  yesButton: "//button[text()='Yes']",
  acctApprove: "//b[text()='Acct. Approve']/ancestor::td/following-sibling::td//input[@name='accApprove']",
  qtyApprove: "//b[text()='Qty Approve']/ancestor::td/following-sibling::td//input[@name='qtyApprove']",
  closePickList: "(//button[text()='Close'])[2]",
} as const

export const customerSelectors = {
  customerName: (idx: number) => `(//span[text()='A']/ancestor::td/following-sibling::td/div[contains(@class,'col-6')]/u)[${idx}]`,
} as const
