# luts/

3D color LUTs (`.cube`) applied to the picture at export, before the creative
grade. This is the technically-correct path for log footage (e.g. S-Log3 to
Rec.709), where a parametric grade cannot do the conversion a LUT can.

Drop a `name.cube` file here, then reference it by name:

```
openklip luts                      # list available LUTs
openklip look <slug> lut <name>    # apply it
openklip look <slug> lut none      # clear it
```

A LUT is referenced by name (not by path) so `project.json` stays portable.
`identity.cube` is a no-op example you can replace with a real conversion LUT.

LUT then grade then vignette is the export order: the LUT does the technical
color transform, the named grade (`openklip look <slug> grade <name>`) adds the
creative look on top.
