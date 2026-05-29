import HeroEditorial from "./Home/HeroEditorial";
import CategoryGrid from "./Home/CategoryGrid";
import HighlightsRail from "./Home/HighlightsRail";
import FeaturedBusinesses from "./Home/FeaturedBusinesses";
import AttractionsBand from "./Home/AttractionsBand";
import DirectoryList from "./Home/DirectoryList";
import StoryBand from "./Home/StoryBand";
import MapExplore from "./Home/MapExplore";
import Newsletter from "./Home/Newsletter";
import {
  getBusinesses,
  getFeaturedCategories,
  getAttractions,
} from "./lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [businesses, featuredCategories, allAttractions] = await Promise.all([
    getBusinesses(),
    getFeaturedCategories(),
    getAttractions(),
  ]);

  // ── Helper ────────────────────────────────────────────────────────────────
  const parseImages = (item: any): string[] => {
    try {
      const v = item.images ?? item.media;
      if (Array.isArray(v)) return v;
      if (typeof v === "string") {
        const p = JSON.parse(v || "[]");
        return Array.isArray(p) ? p : [];
      }
      return [];
    } catch {
      return [];
    }
  };

  // ── Step 1: All attractions with featuredLocation flag ────────────────────
  const allFeaturedAttractions = (allAttractions || []).filter(
    (a: any) => a.featuredLocation === true
  );

  // ── Step 2: Premium items (hero carousel) ─────────────────────────────────
  // Business: sections[].is_premium === true
  const premiumBusinesses = businesses.filter((b: any) =>
    (b.sections || []).some((s: any) => s.is_premium === true)
  );

  // Attraction: sections[].is_premium === true (from ALL attractions, not just featured)
  const premiumAttractions = (allAttractions || [])
    .filter((a: any) =>
      (a.sections || []).some((s: any) => s.is_premium === true)
    )
    .map((a: any) => ({
      id: a.id, name: a.name, slug: a.slug, place_type: "attraction",
      description: a.description, address: a.address,
      images: parseImages(a), working_hours: a.working_hours,
    }));

  const combinedPremium = [...premiumBusinesses, ...premiumAttractions];
  const premiumBizIds = new Set<string>(premiumBusinesses.map((b: any) => String(b.id)));
  const premiumAttrSlugs = new Set<string>(premiumAttractions.map((a: any) => String(a.slug)));

  // ── Step 3: Highlighted places rail ──────────────────────────────────────
  // Business: sections[].is_highlight === true (not premium)
  const highlightedBusinesses = businesses.filter((b: any) => {
    if (premiumBizIds.has(String(b.id))) return false;
    return (b.sections || []).some(
      (s: any) => s.is_highlight === true && s.is_premium !== true
    );
  });

  // Attraction: sections[].is_highlight === true (not premium, from ALL attractions)
  const highlightedAttractions = (allAttractions || [])
    .filter((a: any) => {
      if (premiumAttrSlugs.has(String(a.slug))) return false;
      return (a.sections || []).some(
        (s: any) => s.is_highlight === true && s.is_premium !== true
      );
    })
    .map((a: any) => ({
      id: a.id, name: a.name, slug: a.slug, place_type: "attraction",
      description: a.description, address: a.address,
      images: parseImages(a), working_hours: a.working_hours,
    }));

  const combinedHighlights = [...highlightedBusinesses, ...highlightedAttractions];
  const highlightedBizIds = new Set<string>(highlightedBusinesses.map((b: any) => String(b.id)));
  const highlightedAttrSlugs = new Set<string>(highlightedAttractions.map((a: any) => String(a.slug)));

  // ── Step 4: Featured businesses ───────────────────────────────────────────
  // Businesses in any section, NOT already premium or highlighted
  const featuredBusinesses = businesses.filter((b: any) => {
    if (premiumBizIds.has(String(b.id))) return false;
    if (highlightedBizIds.has(String(b.id))) return false;
    return (b.sections || []).length > 0;
  });
  const featuredBizIds = new Set<string>(featuredBusinesses.map((b: any) => String(b.id)));

  // ── Step 5: Featured attractions ─────────────────────────────────────────
  // featuredLocation === true, NOT already shown in premium or highlighted
  const attractive_locations = allFeaturedAttractions.filter((a: any) =>
    !premiumAttrSlugs.has(String(a.slug)) &&
    !highlightedAttrSlugs.has(String(a.slug))
  );

  // ── Step 6: Directory (everything else) ──────────────────────────────────
  const usedIds = new Set<string>([
    ...Array.from(premiumBizIds),
    ...Array.from(highlightedBizIds),
    ...Array.from(featuredBizIds),
  ]);

  const allBusinesses = businesses.filter(
    (b: any) => !usedIds.has(String(b.id))
  );

  return (
    <>
      {/* 1. Hero — premium items carousel */}
      <HeroEditorial premium={combinedPremium} />

      {/* 2. Categories grid */}
      <CategoryGrid categories={featuredCategories} />

      {/* 3. Highlighted places — horizontal scroll rail */}
      <HighlightsRail items={combinedHighlights} />

      {/* 4. Featured businesses — magazine grid */}
      {featuredBusinesses.length > 0 && (
        <FeaturedBusinesses businesses={featuredBusinesses} />
      )}

      {/* 5. Featured attractions — featuredLocation:true, not in premium/highlighted */}
      <AttractionsBand attractions={attractive_locations} />

      {/* 6. Story / mission */}
      <StoryBand />

      {/* 7. Full directory */}
      <DirectoryList businesses={allBusinesses} />

      {/* 8. Map */}
      <MapExplore businesses={businesses} />

      {/* 9. Newsletter */}
      <Newsletter />
    </>
  );
}
