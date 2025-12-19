'use strict';

import * as os from 'os'

export let isWsl: boolean = /^win/.test(os.platform());

export function winPath(wslPath: string): string {
    const lxss = os.homedir() + '\\AppData\\Local\\lxss';
    if (/^\/mnt/.test(wslPath)) {
        return wslPath.replace(/^\/mnt\/([A-Za-z])/, '$1:').replace(/\//g, '\\')
    } else if (/^\/(home|root)/.test(wslPath)) {
        return lxss + wslPath.replace(/\//g, '\\');
    } else {
        return lxss + '\\rootfs' + wslPath.replace(/\//g, '\\');
    }
}

export function wslPath(winPath: string): string {
    const lxss = os.homedir() + '\\AppData\\Local\\lxss';
    if (RegExp(`^${lxss}\\rootfs`).test(winPath)) {
        return winPath.replace(RegExp(`^${lxss}\\rootfs`), '').replace(/\\/g, '/');
    } else if (RegExp(`^${lxss}`).test(winPath)) {
        return winPath.replace(RegExp(`^${lxss}`), '').replace(/\\/g, '/');
    } else {
        return winPath.replace(/^([A-Za-z]):/, (match, p1) => {
            return `/mnt/${p1.toLowerCase()}`;
        }).replace(/\\/g, '/');
    }
}
