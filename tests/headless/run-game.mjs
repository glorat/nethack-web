// Boots public/nethack.js in Node, answers every prompt automatically, and
// reports which callbacks fired. Exits non-zero if the game never reaches play.
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_INPUTS = Number(process.env.MAX_INPUTS ?? 300);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? 60000);
const VERBOSE = !!process.env.VERBOSE;

const { default: createModule } = await import(
    pathToFileURL(resolve(ROOT, "public/nethack.js")).href
);

const counts = new Map();
const messages = [];
let inputs = 0;
let glyphs = 0;
let reachedPlay = false;
let finished = false;

const moves = "hjklyubn".split("").map((c) => c.charCodeAt(0));

function finish(code, reason) {
    if (finished) return;
    finished = true;
    const report = {
        reason,
        reachedPlay,
        inputs,
        glyphs,
        callbacks: Object.fromEntries([...counts].sort()),
        lastMessages: messages.slice(-15),
    };
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(code);
}

function nextInput() {
    inputs++;
    if (inputs >= MAX_INPUTS) finish(reachedPlay ? 0 : 1, "input limit reached");
    return moves[Math.floor(Math.random() * moves.length)];
}

globalThis.nethackCallback = async (name, ...args) => {
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (VERBOSE && name !== "shim_print_glyph") console.error(name, args);
    switch (name) {
        case "shim_init_nhwindows":
        case "shim_status_init":
            return 0;
        case "shim_player_selection_or_tty":
            return true;
        case "shim_create_nhwindow":
            return counts.get(name) + 10;
        case "shim_putstr":
            messages.push(args[2]);
            return 0;
        case "shim_raw_print":
        case "shim_raw_print_bold":
            messages.push(args[0]);
            return 0;
        case "shim_print_glyph":
            glyphs++;
            reachedPlay = true;
            return 0;
        case "shim_select_menu":
            return -1;
        case "shim_yn_function":
            // q: questions like "Shall I pick ... for you?" get yes; "Really quit?" never arises.
            return "y".charCodeAt(0);
        case "shim_nhgetch":
            return 27;
        case "shim_nh_poskey":
            return nextInput();
        case "shim_message_menu":
            return 0;
        case "shim_getlin":
            return 0;
        case "shim_get_ext_cmd":
            return -1;
        case "shim_getmsghistory":
            return "";
        case "shim_get_color_string":
            return "";
        default:
            return 0;
    }
};

setTimeout(() => finish(reachedPlay ? 0 : 1, "timeout"), TIMEOUT_MS).unref();

const Module = await createModule({
    noInitialRun: true,
    wasmBinary: readFileSync(resolve(ROOT, "public/nethack.wasm")),
    print: (s) => VERBOSE && console.error("[stdout]", s),
    printErr: (s) => VERBOSE && console.error("[stderr]", s),
    preRun: [
        (mod) => {
            mod.ENV.USER = "player";
            mod.ENV.NETHACKOPTIONS = "name:Tester,role:Valkyrie,race:human,gender:female,align:neutral,!autopickup";
        },
    ],
    onExit: (status) => finish(reachedPlay ? 0 : 1, `exit ${status}`),
});

Module.ccall("shim_graphics_set_callback", null, ["string"], ["nethackCallback"]);
try {
    Module._main(0, 0);
} catch (e) {
    if (e?.name !== "ExitStatus") finish(1, `main threw: ${e?.stack ?? e}`);
}
