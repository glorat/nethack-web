/* Writes the core's glyph layout, map symbols, monsters, objects and
   object classes as JSON: the data a bot playing this core needs. */

#include "hack.h"
#include "objconsts.h"

extern glyph_map glyphmap[MAX_GLYPH]; /* src/tile.c, which the build generates */

#define DUMP_ENUMS
#define DUMP_ENUMS_PCHAR
static struct enum_dump cmap_names[] = {
#include "defsym.h"
};
#undef DUMP_ENUMS_PCHAR

#define DUMP_ENUMS_MONSYMS
static struct enum_dump monsym_names[] = {
#include "defsym.h"
};
#undef DUMP_ENUMS_MONSYMS

#define DUMP_ENUMS_OBJCLASS_CLASSES
static struct enum_dump oclass_names[] = {
#include "defsym.h"
};
#undef DUMP_ENUMS_OBJCLASS_CLASSES
#undef DUMP_ENUMS

static void
str(const char *s)
{
    if (!s) {
        fputs("null", stdout);
        return;
    }
    putchar('"');
    for (; *s; s++) {
        if (*s == '"' || *s == '\\')
            printf("\\%c", *s);
        else if ((unsigned char) *s < 0x20)
            printf("\\u%04x", *s);
        else
            putchar(*s);
    }
    putchar('"');
}

static void
names(const char *key, struct enum_dump *d, int n)
{
    printf("\"%s\": {", key);
    for (int i = 0; i < n; i++) {
        printf("%s", i ? ", " : "");
        str(d[i].nm);
        printf(": %d", d[i].val);
    }
    printf("},\n");
}

#define N(a) ((int) (sizeof (a) / sizeof (a)[0]))
#define C(x) printf("\"%s\": %ld,\n", #x, (long) (x))

int
main(void)
{
    monst_globals_init();
    objects_globals_init();
    printf("{\"consts\": {\n");
    C(NUMMONS); C(NUM_OBJECTS); C(MAXPCHARS); C(MAXEXPCHARS); C(EXPL_MAX);
    C(NUM_ZAP); C(WARNCOUNT); C(MAXMCLASSES); C(MAXOCLASSES); C(MAX_GLYPH);
    C(MG_OBJPILE); C(MG_HERO); C(MG_CORPSE); C(MG_INVIS); C(MG_DETECT);
    C(MG_PET); C(MG_RIDDEN); C(MG_STATUE); C(MG_MALE); C(MG_FEMALE);
    C(GLYPH_MON_OFF); C(GLYPH_MON_MALE_OFF); C(GLYPH_MON_FEM_OFF);
    C(GLYPH_PET_OFF); C(GLYPH_PET_MALE_OFF); C(GLYPH_PET_FEM_OFF);
    C(GLYPH_INVIS_OFF); C(GLYPH_DETECT_OFF); C(GLYPH_DETECT_MALE_OFF);
    C(GLYPH_DETECT_FEM_OFF); C(GLYPH_BODY_OFF); C(GLYPH_RIDDEN_OFF);
    C(GLYPH_RIDDEN_MALE_OFF); C(GLYPH_RIDDEN_FEM_OFF); C(GLYPH_OBJ_OFF);
    C(GLYPH_CMAP_OFF); C(GLYPH_CMAP_STONE_OFF); C(GLYPH_CMAP_MAIN_OFF);
    C(GLYPH_CMAP_MINES_OFF); C(GLYPH_CMAP_GEH_OFF); C(GLYPH_CMAP_KNOX_OFF);
    C(GLYPH_CMAP_SOKO_OFF); C(GLYPH_CMAP_A_OFF); C(GLYPH_ALTAR_OFF);
    C(GLYPH_CMAP_B_OFF); C(GLYPH_ZAP_OFF); C(GLYPH_CMAP_C_OFF);
    C(GLYPH_SWALLOW_OFF); C(GLYPH_EXPLODE_OFF); C(GLYPH_WARNING_OFF);
    C(GLYPH_STATUE_OFF); C(GLYPH_STATUE_MALE_OFF); C(GLYPH_STATUE_FEM_OFF);
    C(GLYPH_PILETOP_OFF); C(GLYPH_OBJ_PILETOP_OFF); C(GLYPH_BODY_PILETOP_OFF);
    C(GLYPH_STATUE_MALE_PILETOP_OFF); C(GLYPH_STATUE_FEM_PILETOP_OFF);
    C(GLYPH_UNEXPLORED_OFF); C(GLYPH_NOTHING_OFF);
    printf("\"_end\": 0},\n");

    printf("\"objconsts\": {");
#define X(n) printf("\"%s\": %ld, ", #n, (long) (n));
    OBJ_CONSTS
#undef X
    printf("\"_end\": 0},\n");

    names("cmap", cmap_names, N(cmap_names));
    names("monsyms", monsym_names, N(monsym_names));
    names("oclasses", oclass_names, N(oclass_names));

    printf("\"defsyms\": [\n");
    for (int i = 0; i < MAXPCHARS; i++) {
        printf("%s[%d, ", i ? ",\n" : "", defsyms[i].sym);
        str(defsyms[i].explanation);
        printf("]");
    }
    printf("],\n");

    printf("\"monsters\": [\n");
    for (int i = 0; i < NUMMONS; i++) {
        struct permonst *p = &mons[i];
        printf("%s{\"names\": [", i ? ",\n" : "");
        str(p->pmnames[MALE]); printf(", ");
        str(p->pmnames[FEMALE]); printf(", ");
        str(p->pmnames[NEUTRAL]);
        printf("], \"mlet\": %d, \"mlevel\": %d, \"mmove\": %d, \"ac\": %d,"
               " \"mr\": %d, \"maligntyp\": %d, \"geno\": %u, \"cwt\": %u,"
               " \"cnutrit\": %u, \"msound\": %u, \"msize\": %u,"
               " \"mresists\": %u, \"mconveys\": %u, \"mflags1\": %lu,"
               " \"mflags2\": %lu, \"mflags3\": %u, \"difficulty\": %u,"
               " \"mcolor\": %u, \"mattk\": [",
               p->mlet, p->mlevel, p->mmove, p->ac, p->mr, p->maligntyp,
               p->geno, p->cwt, p->cnutrit, p->msound, p->msize,
               p->mresists, p->mconveys, p->mflags1, p->mflags2,
               p->mflags3, p->difficulty, p->mcolor);
        for (int a = 0; a < NATTK; a++)
            printf("%s[%d, %d, %d, %d]", a ? ", " : "", p->mattk[a].aatyp,
                   p->mattk[a].adtyp, p->mattk[a].damn, p->mattk[a].damd);
        printf("]}");
    }
    printf("],\n");

    /* before the game shuffles them, each object's tile is that of its own appearance */
    printf("\"object_tiles\": [");
    for (int i = 0; i < NUM_OBJECTS; i++)
        printf("%s%d", i ? ", " : "", glyphmap[GLYPH_OBJ_OFF + i].tileidx);
    printf("],\n");

    printf("\"objects\": [\n");
    for (int i = 0; i < NUM_OBJECTS; i++) {
        struct objclass *o = &objects[i];
        printf("%s{\"name\": ", i ? ",\n" : "");
        str(obj_descr[i].oc_name);
        printf(", \"descr\": ");
        str(obj_descr[i].oc_descr);
        printf(", \"class\": %d, \"name_known\": %d, \"merge\": %d,"
               " \"uses_known\": %d, \"magic\": %d, \"charged\": %d,"
               " \"unique\": %d, \"nowish\": %d, \"big\": %d, \"tough\": %d,"
               " \"dir\": %d, \"material\": %d, \"subtyp\": %d,"
               " \"oprop\": %d, \"delay\": %d, \"color\": %d, \"prob\": %d,"
               " \"weight\": %u, \"cost\": %d, \"wsdam\": %d, \"wldam\": %d,"
               " \"oc1\": %d, \"oc2\": %d, \"nutrition\": %u}",
               o->oc_class, o->oc_name_known, o->oc_merge, o->oc_uses_known,
               o->oc_magic, o->oc_charged, o->oc_unique, o->oc_nowish,
               o->oc_big, o->oc_tough, o->oc_dir, o->oc_material,
               o->oc_subtyp, o->oc_oprop, o->oc_delay, o->oc_color,
               o->oc_prob, o->oc_weight, o->oc_cost, o->oc_wsdam,
               o->oc_wldam, o->oc_oc1, o->oc_oc2, o->oc_nutrition);
    }
    printf("]}\n");
    return 0;
}
