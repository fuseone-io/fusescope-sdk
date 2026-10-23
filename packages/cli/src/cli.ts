import { HELP, parseCommand, UsageError } from './args.js';
import { ApiError } from './client.js';
import { EXIT, type Io } from './io.js';
import { list, remove } from './manage.js';
import { hint, upload } from './upload.js';
import { VERSION } from './version.js';

export async function main(argv: string[], io: Io): Promise<number> {
  try {
    const cmd = parseCommand(argv, io.env);
    switch (cmd.name) {
      case 'help':
        io.stdout(HELP);
        return EXIT.ok;
      case 'version':
        io.stdout(`${VERSION}\n`);
        return EXIT.ok;
      case 'upload':
        return await upload(cmd, io);
      case 'list':
        return await list(cmd, io);
      case 'delete':
        return await remove(cmd, io);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`fusescope: ${e.message}\nRun "fusescope --help" for usage.\n`);
      return EXIT.usage;
    }
    if (e instanceof ApiError) {
      io.stderr(`fusescope: ${e.message}${hint(e)}\n`);
      return e.isAuth ? EXIT.auth : EXIT.failed;
    }
    io.stderr(`fusescope: ${(e as Error).message}\n`);
    return EXIT.failed;
  }
}
