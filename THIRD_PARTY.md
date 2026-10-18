# Third-party anatomy

The dental chart uses rendered sprites of the permanent teeth from BodyParts3D / Anatomography, not hand-drawn outlines.

- Dataset: [BodyParts3D](https://lifesciencedb.jp/bp3d/) (Database Center for Life Science, DBCLS)
- License: [Creative Commons Attribution 4.0 International](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html) (page updated 2025-02-27)
- Credit: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International
- Publication: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37:D782–D785. doi:10.1093/nar/gkn613

The meshes were downloaded as full-resolution OBJ parts from the Anatomography viewer (`download.cgi`). The public bulk archive is a 99% polygon reduction and was not used.

Wisdom teeth 18, 28, 38 and 48 are not in the dataset. Each is derived from the second molar on the same side: scaled to 0.9 in width and depth, with the root-side vertices pulled slightly toward the long axis. Deciduous teeth 51–85 are the permanent sprites of the matching tooth type, drawn smaller in the chart. The titanium implant is a generated screw and abutment, not a BodyParts3D part.

Sprites are buccal and occlusal renders with a glossy enamel and a matte cementum. The chart keeps the original arch, selection and surface hit areas.
