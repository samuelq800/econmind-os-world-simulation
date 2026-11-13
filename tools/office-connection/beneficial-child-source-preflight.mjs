import path from 'node:path';
/** Match the actual native-reference helper's conservative Unix socket budget
 * before reading/parsing either large seed or issuing the opaque preparation. */
export function assertBeneficialChildNativeEvidenceDirectory(directory) {
  const prefix = '/workspace/.cloud-setup/evidence/';
  if (
    typeof directory !== 'string' ||
    !directory.startsWith(prefix) ||
    directory !== path.resolve(directory)
  )
    throw Error('OWNED_NEW_NATIVE_EVIDENCE_DIRECTORY_REQUIRED');
  const socket = path.join(directory, 'socket-00000000');
  if (Buffer.byteLength(socket, 'utf8') + 20 > 107)
    throw Error('REFERENCE_UNIX_SOCKET_PATH_TOO_LONG');
  return directory;
}
