// C41's unchanged CAD chain has 15.875 mm pitch, 35 rear teeth and 11
// gearbox-output teeth. The native Blender clip holds third gear: its
// output shaft turns 19/64 revolution per crank revolution. All three
// motions share this relationship; display slowdown is applied upstream.
const rearTeeth=35,frontTeeth=11,pitch=.015875,outputPerCrank=19/64;
export const C41_DRIVE=Object.freeze({
 rearTeeth,frontTeeth,pitch,outputPerCrank,
 crankPerAxle:rearTeeth/frontTeeth/outputPerCrank,
 chainMetresPerAxleRadian:rearTeeth*pitch/(2*Math.PI),
 nativeCrankReference:Math.PI/3,
 basis:'native third-gear clip and original CAD chain pitch geometry'
});
