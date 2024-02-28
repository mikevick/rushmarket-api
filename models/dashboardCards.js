'use strict';

const globals = require('../globals');
const colUtils = require('../utils/columnUtils');

exports.getDashboardCards = async (userType) => {
  const internal = userType === 'INTERNAL';

  const result = await globals.productROPool.query(`
    SELECT c.id, c.title, c.body
    FROM dashboard_cards c
    ${internal ?
            `WHERE EXISTS(SELECT 1 FROM dashboard_cards_to_user_type u WHERE u.dashboard_card_id = c.id)` :
            
            `LEFT JOIN dashboard_cards_to_user_type u ON c.id = u.dashboard_card_id
             WHERE u.user_type = ?`
    }
    ORDER BY c.display_order`, internal ? [] : [userType]);
  colUtils.outboundNaming(result);
  return result;
}
