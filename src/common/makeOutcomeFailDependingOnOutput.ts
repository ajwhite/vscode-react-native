// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import * as Q from "q";
import {ISpawnResult} from "./node/childProcess";

export type PatternToFailure = { [pattern: string]: string };

/* This class will transform a spawn process to only succed if all defined success patterns
   are found on stdout, and none of the failure patterns were found on stderr */
export class MakeOutcomeFailDependingOnOutput {
    private patternToFailure: PatternToFailure;
    private patternsForSuccess: string[];

    private output = "";
    private errors = "";

    constructor(patternsForSuccess: string[], patternToFailure: PatternToFailure) {
        this.patternsForSuccess = patternsForSuccess;
        this.patternToFailure = patternToFailure;
    }

    private findAnyFailurePattern(): string {
        // We check the failure patterns one by one, to see if any of those appeared on the errors
        const existingPattern = Object.keys(this.patternToFailure).find(pattern => this.errors.indexOf(pattern) !== -1);
        return existingPattern ? this.patternToFailure[existingPattern] : null;
    }

    private store(stream: NodeJS.ReadableStream, append: (new_content: string) => void) {
        stream.on("data", (data: Buffer) => {
            append(data.toString());
        });
    }

    private areAllSuccessPatternsPresent() {
        return this.patternsForSuccess.every(pattern =>
            this.output.indexOf(pattern) !== -1);
    }

    public process(spawnResult: ISpawnResult): Q.Promise<void> {
        // Store all output
        this.store(spawnResult.stdout, new_content => this.output += new_content);
        this.store(spawnResult.stderr, new_content => this.errors += new_content);

        return spawnResult.outcome.then(() => {
            const failureMessage = this.findAnyFailurePattern();
            if (failureMessage) { // If at least one failure happened, we fail
                return Q.reject<void>(new Error(failureMessage));
            } else if (!this.areAllSuccessPatternsPresent()) { // If we don't find all the success patterns, we also fail
                return Q.reject<void>(new Error("Unknown error"));
            } // else we found all the success patterns, so we succeed
        });
    }
}
