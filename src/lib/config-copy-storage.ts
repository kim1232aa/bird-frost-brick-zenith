export type ConfigCopyStorage = {
    setNative: (name: string, value: string) => Promise<void>;
    setBrowser: (name: string, value: string) => Promise<void>;
};

export function assertNativeConfigReadable(desktopRequired: boolean, ...errors: unknown[]) {
    if (!desktopRequired) return;
    const nativeError = errors.find((error) => error !== undefined);
    if (nativeError !== undefined) throw nativeError;
}

export async function writeConfigCopies(
    name: string,
    recoveryName: string,
    fullValue: string,
    browserValue: string,
    storage: ConfigCopyStorage,
    nativeRequired: boolean,
) {
    let nativeError: unknown;
    try {
        await storage.setNative(name, fullValue);
        await storage.setNative(recoveryName, fullValue);
    } catch (error) {
        nativeError = error;
    }
    await storage.setBrowser(recoveryName, browserValue);
    await storage.setBrowser(name, browserValue);
    if (nativeRequired && nativeError !== undefined) throw nativeError;
}
