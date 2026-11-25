/**
 * The type check's stand-in for `sn-plugin-lib` in the packages workspace, which does not install
 * the SDK (#142): every export is loose, as the Jest mock beside it answers at run time. Each
 * plugin's own type check reads the SDK's real types.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/** Loose too, but for the one callback whose argument type the official tier infers. */
export declare const PluginManager: {
  [name: string]: any;
  registerButtonListener(listener: {onButtonPress(event: {id: number}): void}): any;
};
export declare const PluginCommAPI: any;
export declare const PluginNoteAPI: any;
export declare const PluginFileAPI: any;
export declare const FileUtils: any;
export declare const PointUtils: any;
