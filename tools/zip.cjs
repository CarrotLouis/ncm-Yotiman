// MIT. ZIP writer adapted from CarrotLouis/jp-furigana tools/pack.js.
'use strict';
const zlib=require('node:zlib');
const CRC_TABLE = (() => {
	const table = new Int32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[i] = c;
	}
	return table;
})();

function crc32(buf) {
	let c = -1;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

/** ZIP 用的 DOS 时间戳，秒只有 2 秒精度 */
function dosDateTime(date) {
	const year = Math.max(1980, date.getFullYear());
	return {
		time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
		date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
	};
}

/**
 * @param {{name: string, data: Buffer, mtime: Date}[]} entries 条目名必须用正斜杠
 */
function buildZip(entries) {
	const locals = [];
	const centrals = [];
	let offset = 0;

	for (const entry of entries) {
		const name = Buffer.from(entry.name, 'utf8');
		const compressed = zlib.deflateRawSync(entry.data, { level: 9 });
		const crc = crc32(entry.data);
		const { time, date } = dosDateTime(entry.mtime);

		const local = Buffer.alloc(30 + name.length);
		local.writeUInt32LE(0x04034b50, 0); // 局部文件头签名
		local.writeUInt16LE(20, 4); // 解压所需版本
		local.writeUInt16LE(0, 6); // 通用标志位
		local.writeUInt16LE(8, 8); // 压缩方法 deflate
		local.writeUInt16LE(time, 10);
		local.writeUInt16LE(date, 12);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(compressed.length, 18);
		local.writeUInt32LE(entry.data.length, 22);
		local.writeUInt16LE(name.length, 26);
		local.writeUInt16LE(0, 28); // 扩展字段长度
		name.copy(local, 30);
		locals.push(local, compressed);

		const central = Buffer.alloc(46 + name.length);
		central.writeUInt32LE(0x02014b50, 0); // 中央目录项签名
		central.writeUInt16LE(20, 4); // 创建版本
		central.writeUInt16LE(20, 6); // 解压所需版本
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(8, 10);
		central.writeUInt16LE(time, 12);
		central.writeUInt16LE(date, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(compressed.length, 20);
		central.writeUInt32LE(entry.data.length, 24);
		central.writeUInt16LE(name.length, 28);
		central.writeUInt16LE(0, 30); // 扩展字段
		central.writeUInt16LE(0, 32); // 注释
		central.writeUInt16LE(0, 34); // 起始磁盘号
		central.writeUInt16LE(0, 36); // 内部属性
		central.writeUInt32LE(0, 38); // 外部属性
		central.writeUInt32LE(offset, 42); // 局部头偏移
		name.copy(central, 46);
		centrals.push(central);

		offset += local.length + compressed.length;
	}

	const centralBuf = Buffer.concat(centrals);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0); // 中央目录结束记录
	end.writeUInt16LE(0, 4);
	end.writeUInt16LE(0, 6);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuf.length, 12);
	end.writeUInt32LE(offset, 16);
	end.writeUInt16LE(0, 20); // 注释长度

	return Buffer.concat([...locals, centralBuf, end]);
}


module.exports={buildZip};
