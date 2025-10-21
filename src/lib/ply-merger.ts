import { addLog } from './stores.js';

export interface GaussianVertex {
  position: [number, number, number];
  scale: [number, number, number];
  rotation: [number, number, number, number];
  opacity: number;
  sh: number[]; // Spherical harmonics coefficients
}

export class PLYMerger {
  private static VERTEX_SIZE = 59 * 4; // 59 floats * 4 bytes each
  private static SH_COEFFS = 48; // 48 spherical harmonics coefficients

  static async readGaussianPLY(blob: Blob): Promise<GaussianVertex[]> {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const dataView = new DataView(arrayBuffer);
      const decoder = new TextDecoder();

      // Read header to find vertex count and end_header position
      const headerBytes = new Uint8Array(arrayBuffer.slice(0, Math.min(arrayBuffer.byteLength, 2048)));
      const headerText = decoder.decode(headerBytes);

      const lines = headerText.split('\n');
      let vertexCount = 0;
      let headerEndOffset = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('element vertex')) {
          vertexCount = parseInt(line.split(' ')[2]);
        } else if (line === 'end_header') {
          // Calculate byte offset of end_header line
          const headerUpToEndHeader = lines.slice(0, i + 1).join('\n') + '\n';
          headerEndOffset = new TextEncoder().encode(headerUpToEndHeader).length;
          break;
        }
      }

      if (vertexCount === 0) {
        throw new Error('No vertex count found in PLY header');
      }

      const vertices: GaussianVertex[] = [];
      let offset = headerEndOffset;

      // Read vertex data (binary format)
      for (let i = 0; i < vertexCount; i++) {
        if (offset + this.VERTEX_SIZE > arrayBuffer.byteLength) {
          console.warn(`Incomplete vertex data at vertex ${i}, stopping read`);
          break;
        }

        const vertex: GaussianVertex = {
          position: [
            dataView.getFloat32(offset, true),      // x
            dataView.getFloat32(offset + 4, true),  // y
            dataView.getFloat32(offset + 8, true)   // z
          ],
          scale: [
            dataView.getFloat32(offset + 12, true), // scale_0
            dataView.getFloat32(offset + 16, true), // scale_1
            dataView.getFloat32(offset + 20, true)  // scale_2
          ],
          rotation: [
            dataView.getFloat32(offset + 24, true), // rot_0
            dataView.getFloat32(offset + 28, true), // rot_1
            dataView.getFloat32(offset + 32, true), // rot_2
            dataView.getFloat32(offset + 36, true)  // rot_3
          ],
          opacity: dataView.getFloat32(offset + 40, true), // opacity
          sh: []
        };

        // Read spherical harmonics coefficients (3 DC + 45 rest = 48 total)
        for (let j = 0; j < this.SH_COEFFS; j++) {
          vertex.sh.push(dataView.getFloat32(offset + 44 + (j * 4), true));
        }

        vertices.push(vertex);
        offset += this.VERTEX_SIZE;
      }

      return vertices;
    } catch (error) {
      throw new Error(`Failed to read PLY file: ${error}`);
    }
  }

  static writeGaussianPLY(vertices: GaussianVertex[]): Blob {
    try {
      const vertexCount = vertices.length;

      // Create header
      let header = 'ply\n';
      header += 'format binary_little_endian 1.0\n';
      header += `element vertex ${vertexCount}\n`;

      // Position properties
      header += 'property float x\n';
      header += 'property float y\n';
      header += 'property float z\n';

      // Scale properties
      header += 'property float scale_0\n';
      header += 'property float scale_1\n';
      header += 'property float scale_2\n';

      // Rotation properties
      header += 'property float rot_0\n';
      header += 'property float rot_1\n';
      header += 'property float rot_2\n';
      header += 'property float rot_3\n';

      // Opacity
      header += 'property float opacity\n';

      // Spherical harmonics DC coefficients
      header += 'property float f_dc_0\n';
      header += 'property float f_dc_1\n';
      header += 'property float f_dc_2\n';

      // Spherical harmonics rest coefficients
      for (let i = 0; i < 45; i++) {
        header += `property float f_rest_${i}\n`;
      }

      header += 'end_header\n';

      // Convert header to bytes
      const headerBytes = new TextEncoder().encode(header);

      // Calculate binary data size
      const binaryDataSize = vertexCount * this.VERTEX_SIZE;

      // Create output buffer
      const totalSize = headerBytes.length + binaryDataSize;
      const buffer = new ArrayBuffer(totalSize);
      const uint8View = new Uint8Array(buffer);
      const dataView = new DataView(buffer);

      // Write header
      uint8View.set(headerBytes, 0);

      // Write vertex data
      let offset = headerBytes.length;
      for (const vertex of vertices) {
        // Position
        dataView.setFloat32(offset, vertex.position[0], true);
        dataView.setFloat32(offset + 4, vertex.position[1], true);
        dataView.setFloat32(offset + 8, vertex.position[2], true);

        // Scale
        dataView.setFloat32(offset + 12, vertex.scale[0], true);
        dataView.setFloat32(offset + 16, vertex.scale[1], true);
        dataView.setFloat32(offset + 20, vertex.scale[2], true);

        // Rotation
        dataView.setFloat32(offset + 24, vertex.rotation[0], true);
        dataView.setFloat32(offset + 28, vertex.rotation[1], true);
        dataView.setFloat32(offset + 32, vertex.rotation[2], true);
        dataView.setFloat32(offset + 36, vertex.rotation[3], true);

        // Opacity
        dataView.setFloat32(offset + 40, vertex.opacity, true);

        // Spherical harmonics
        for (let i = 0; i < this.SH_COEFFS; i++) {
          dataView.setFloat32(offset + 44 + (i * 4), vertex.sh[i] || 0, true);
        }

        offset += this.VERTEX_SIZE;
      }

      return new Blob([buffer], { type: 'application/octet-stream' });
    } catch (error) {
      throw new Error(`Failed to write PLY file: ${error}`);
    }
  }

  static async mergeChunks(chunks: { id: string; blob: Blob; url: string }[]): Promise<Blob> {
    if (chunks.length === 0) {
      throw new Error('No chunks to merge');
    }

    addLog(`🔄 Merging ${chunks.length} chunk files...`);

    const allVertices: GaussianVertex[] = [];

    // Sort chunks by ID to ensure consistent ordering
    const sortedChunks = chunks.sort((a, b) => a.id.localeCompare(b.id));

    for (const chunk of sortedChunks) {
      try {
        const vertices = await this.readGaussianPLY(chunk.blob);
        allVertices.push(...vertices);
        addLog(`  📄 Read ${vertices.length} gaussians from chunk ${chunk.id}`);
      } catch (error) {
        addLog(`❌ Failed to read chunk ${chunk.id}: ${error}`);
        throw error;
      }
    }

    if (allVertices.length === 0) {
      throw new Error('No gaussians found to merge');
    }

    const mergedBlob = this.writeGaussianPLY(allVertices);
    addLog(`✅ Merged ${allVertices.length} gaussians into combined PLY file`);

    return mergedBlob;
  }

  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
