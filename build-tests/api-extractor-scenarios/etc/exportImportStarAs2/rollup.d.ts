/**
 * @public
 */
declare function exportedApi(): forgottenNs.ForgottenClass;

/**
 * @public
 */
declare class ForgottenClass {
}

declare namespace forgottenNs {
    export {
        ForgottenClass
    }
}

declare namespace ns {
    export {
        exportedApi
    }
}
export { ns }

export { }
