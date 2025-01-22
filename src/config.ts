const throwIfNot = function<T, K extends keyof T>(obj: Partial<T>, prop: K, msg?: string): T[K] {
  if(obj[prop] === undefined || obj[prop] === null){
    throw new Error(msg || `Environment is missing variable ${String(prop)}`)
  } else {
    return obj[prop] as T[K]
  }
};

[
  'XUI_ORIGIN',
  'XUI_USERNAME',
  'XUI_PASSWORD',
].forEach(v => throwIfNot(process.env, v))

export interface IProcessEnv {
  XUI_ORIGIN: string
  XUI_BASIC_AUTH?: string
  XUI_USERNAME: string
  XUI_PASSWORD: string
  XUI_LOGIN_SECRET?: string
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface ProcessEnv extends IProcessEnv { }
  }
}
   